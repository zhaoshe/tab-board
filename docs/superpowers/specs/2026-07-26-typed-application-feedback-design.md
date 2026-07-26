# Typed Application Feedback Channel 设计

## 背景

第二轮架构复盘确认，TabBoard 的 persistence、domain 与 page-local state owners
已经清晰，最后一条高价值隐藏 seam 是 application feedback：

- `useTabBoardStore.ts` 在 authoritative commit / surfaced error 后调用
  `emitEvent(AppEvents.*)`；
- `shared/utils/events.ts` 把未类型化 payload 包进 `window.CustomEvent`；
- Manager `useToastNotifications()` 通过四个 event names 订阅，再用 type assertion
  解释 `unknown` payload；
- store tests需要 stub `window.dispatchEvent` 才能验证 feedback timing；
- `events.ts` 还维护一个从未被 `onEvent()` 注册的 dead listener map。

该 channel 只在当前 page 生效，没有提供 worker、Manager、Options 或 Popup之间的
跨 context通信，因此 window event bus没有额外能力收益。

## 目标

- 建立 framework-neutral、typed、page-local application feedback owner。
- 保持 feedback 的 authoritative timing：
  - save/import/restore只在 mutation确认 committed 后publish；
  - partial commit只publish committed mutations；
  - retry中的transient failure不提前publish error；
  - publication决定 surface error 时才publish `operation-failed`。
- Manager toast consumer使用 discriminated union，不再断言 `unknown` payload。
- 删除 `shared/utils/events.ts`、`AppEvents`、window CustomEvent与dead listener map。
- feedback subscriber异常不得改变 persistence outcome。
- 保持现有 toast文案、标题和3秒 lifecycle不变。
- 把禁止 global application-feedback event bus加入静态架构门禁。

## 非目标

- 不建立跨 extension page 的 feedback同步或历史replay。
- 不把 toast列表放入 Zustand/TabBoard state。
- 不改变 Storage Authority fallback channel；Manager、Options和store仍可分别投影
  fallback outcome。
- 不改变 publication retry、partial commit、waiter或reconciliation算法。
- 不把所有组件本地 `useToast()` 调用迁入application feedback。
- 不拆分 `authoritativePublication.ts`、`stateMutations.ts` 或 `ManagerLayout.tsx`。

## 备选方案

### 方案一：把 feedback callbacks 注入每个 store action

由 UI 在调用 `addGroup()`、`restoreFromBin()`、`importGroups()` 时传入
`onSuccess` / `onError` callback。

优点：

- 调用关系显式；
- 不需要共享channel。

缺点：

- feedback时机由调用方拥有，容易在optimistic action返回时过早提示；
- background retry、partial commit和terminal isolation无法由原始caller准确判断；
- store action signatures被UI反馈污染；
- Options/Popup callers需要提供无意义callbacks。

结论：不采用。authoritative outcome必须仍由publication/store adapter拥有。

### 方案二：把 feedback放入 Zustand UI slice

在 `useTabBoardStore` 中增加 `feedbackQueue` 或 `lastFeedback`，Manager通过selector
消费并清除。

优点：

- consumer订阅方式与现有state一致；
- 无额外singleton。

缺点：

- 一次性notification进入authoritative projection，容易被hydration/reconciliation
  覆盖或重放；
- 必须增加ack/clear protocol，形成第二套队列时序；
- Options/Popup也会携带Manager toast state；
- feedback不是persisted domain state。

结论：不采用。event stream不应伪装成state snapshot。

### 方案三：typed external channel

建立普通TypeScript channel，提供 `publish()` / `subscribe()`；store adapter发布
typed union，Manager hook订阅并映射为toast。

优点：

- producer/consumer contract在import graph中可见；
- 不依赖DOM、React、Zustand、Chrome或TabBoard state；
- factory instance可直接测试，singleton保持当前page-local semantics；
- synchronous publish保持现有通知时序；
- 不需要ack/replay。

缺点：

- 每个bundle/page有一个module singleton；
- late subscriber不会收到历史feedback；
- subscriber异常需要显式隔离。

结论：采用。page-local、non-replay正是当前UI notification语义。

## 设计

### 1. Typed owner

新增 `src/shared/applicationFeedback.ts`：

```ts
export type ApplicationFeedback =
  | {
      kind: 'save-succeeded';
      title: string;
      tabCount: number;
    }
  | {
      kind: 'import-succeeded';
      groupCount: number;
      tabCount: number;
    }
  | {
      kind: 'restore-succeeded';
      item: 'group' | 'tab';
      count: number;
      label: string;
    }
  | {
      kind: 'operation-failed';
      source: 'persistence' | 'import';
      message: string;
    };

export interface ApplicationFeedbackChannel {
  publish(feedback: ApplicationFeedback): void;
  subscribe(
    listener: (feedback: ApplicationFeedback) => void,
  ): () => void;
}

export function createApplicationFeedbackChannel():
  ApplicationFeedbackChannel;

export const applicationFeedbackChannel:
  ApplicationFeedbackChannel;
```

规则：

1. channel不读取/写入DOM global；
2. `subscribe()` 返回精确unsubscribe；
3. `publish()` 同步按当前listener snapshot通知；
4. listener在publish中unsubscribe不影响本次其他listeners；
5. listener抛错时channel捕获并继续通知，`publish()`永不抛出；
6. 不保存last value，不向late subscriber replay；
7. factory用于direct tests，singleton用于同页production wiring。

### 2. Mutation feedback mapping

新增 `src/shared/store/stateMutationFeedback.ts`：

```ts
export function feedbackForCommittedMutation(
  mutation: StateMutation,
): ApplicationFeedback | null;
```

mapping：

- `add-group` → `save-succeeded`；
- `import-groups` → `import-succeeded`；
- `restore-group` → `restore-succeeded`, `item: 'group'`；
- `restore-tab` → `restore-succeeded`, `item: 'tab'`；
- 其它mutation → `null`。

该module是pure adapter mapping：只依赖 `StateMutation` type和
`ApplicationFeedback` type，不依赖publication、Zustand、DOM或Manager。

### 3. Store feedback publication

`useTabBoardStore.ts` 从channel import singleton。现有：

- `reportError()`；
- `emitRestoreSuccesses()`；
- `emitMutationSuccesses()`。

改为 typed publish：

```ts
applicationFeedbackChannel.publish({
  kind: 'operation-failed',
  source,
  message,
});
```

和：

```ts
const feedback = feedbackForCommittedMutation(mutation);
if (feedback) applicationFeedbackChannel.publish(feedback);
```

`onMutationCommitted`只publish非null feedback。Publication继续决定何时调用该port，
因此：

- optimistic apply不提示成功；
- retry未完成不提示成功；
- partial response只为committed indexes提示；
- stale context continuation不提示；
-成功后reconciliation failure可先产生success，再产生surface error，保持当前顺序。

### 4. Error timing

`reportError(error, source, notify)`继续：

1. 更新 `persistenceError` projection；
2. 仅在 `notify === true` 时publish `operation-failed`。

这保留publication的 `shouldNotify` policy：

- transient retry期间不提示；
- waiter-owned drop error由caller toast负责时不重复提示；
- terminal ordinary/import/restore error按现有规则提示；
- hydration `notify: false` 不产生toast。

### 5. Manager presentation

`useToastNotifications.ts` 改为单次订阅
`applicationFeedbackChannel.subscribe()`，并把presentation拆为pure function：

```ts
export interface FeedbackPresenter {
  showSuccess(message: string, title?: string): void;
  showError(message: string, title?: string): void;
}

export function presentApplicationFeedback(
  feedback: ApplicationFeedback,
  presenter: FeedbackPresenter,
): void;
```

文案保持：

- save：`N tab(s) saved`，title为session title；
- import：`Imported N session(s) (M tabs)`，title为`Import successful`；
- restore group：`Restored N tab(s)`，title为label；
- restore tab：`Tab restored`，title为label；
- error：message，使用默认error title。

hook只负责 lifecycle：

```ts
useEffect(
  () => applicationFeedbackChannel.subscribe(
    (feedback) => presentApplicationFeedback(feedback, presenter),
  ),
  [presenter],
);
```

为避免每次render重订阅，presenter通过 `useMemo` 或stable callbacks构造。

### 6. Page boundaries

`useTabBoardStore`也被Options和Popup import。每个Vite entry有自己的module graph和
channel singleton：

- Manager有toast subscriber；
- Options/Popup没有subscriber，publish为no-op；
- 当前window event实现同样不会跨page，因此行为不变；
- 不引入BroadcastChannel或chrome.storage作为feedback transport。

### 7. 删除旧总线

完成consumer迁移后删除：

- `src/shared/utils/events.ts`；
- `AppEvents`；
- `emitEvent()` / `onEvent()` imports；
- `tabboard:save-success`；
- `tabboard:import-success`；
- `tabboard:restore-success`；
- `tabboard:error`。

tests不再stub `window.dispatchEvent`来验证store feedback。

## 测试策略

### Channel direct tests

覆盖：

- publish同步通知多个listeners；
- unsubscribe；
- listener在publish中unsubscribe；
- listener抛错不阻止其他listener且publish不抛；
- two instances隔离；
- late subscriber不replay。

### Store integration tests

把现有window-event assertions迁为typed feedback collection，继续覆盖：

- save只在authoritative persistence resolve后publish；
- partial drop response只publishcommitted save；
- failed import只publisherror，不publishsuccess；
- deferred import成功后publish；
- restore成功/碰撞/worker失败/no-target；
- terminal/reconciliation error的success/error顺序；
- transient retry不提前publish；
- `notify: false`不publish。

测试应订阅与当前store module graph相同的channel instance；动态
`vi.resetModules()` case必须同轮dynamic import store与channel。

### Mutation mapping tests

Direct test四类feedback mapping和其它mutation的`null`结果；expected payload使用
hand-written literals，不复用mapper逻辑。

### Toast presentation tests

direct test `presentApplicationFeedback()` 对每个union variant产生现有文案；
hook DOM test验证mount后接收、unmount后停止接收。

### Static gates

扩展architecture checker：

- production source不得出现旧四个event names；
- `shared/applicationFeedback.ts`不得import React、Zustand、shared/store或读取
  `window` / `document` / `chrome`；
- `useToastNotifications.ts`不得使用 `window.addEventListener` 或payload assertions；
- `shared/utils/events.ts`必须不存在。

## 文档更新

- `docs/technical-architecture.md`：记录typed feedback owner、authoritative timing、
  page-local/non-replay语义和subscriber isolation。
- `docs/feature-evolution.md`：记录删除最后一条Store → Manager DOM event seam。
- `docs/product-decisions.md`：记录为什么不用callbacks或Zustand queue。

## 完成标准

- application feedback只有一个typed owner。
- store/Manager不再通过window event names通信。
- `events.ts`与dead listener map删除。
- authoritative commit/error timing与现有tests一致。
- subscriber异常不会影响persistence结果。
- focused tests、`npm run build`、`npm run check`、`npm test`、
  `git diff --check`全部通过。
- 完成后进行第三轮全仓架构分析；若无新P1，进入最终completion audit。

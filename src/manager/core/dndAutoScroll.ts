export interface HorizontalAutoScrollInput {
  pointerX: number;
  viewportLeft: number;
  viewportRight: number;
  zoneWidth?: number;
  minSpeed?: number;
  maxSpeed?: number;
}

export interface HorizontalAutoScroll {
  direction: -1 | 0 | 1;
  speed: number;
  depth: number;
}

const IDLE_AUTO_SCROLL: HorizontalAutoScroll = {
  direction: 0,
  speed: 0,
  depth: 0,
};

const DEFAULT_ZONE_WIDTH = 48;
const DEFAULT_MIN_SPEED = 3;
const DEFAULT_MAX_SPEED = 12;

export function getHorizontalAutoScroll({
  pointerX,
  viewportLeft,
  viewportRight,
  zoneWidth = DEFAULT_ZONE_WIDTH,
  minSpeed = DEFAULT_MIN_SPEED,
  maxSpeed = DEFAULT_MAX_SPEED,
}: HorizontalAutoScrollInput): HorizontalAutoScroll {
  if (
    !Number.isFinite(pointerX)
    || !Number.isFinite(viewportLeft)
    || !Number.isFinite(viewportRight)
    || !Number.isFinite(zoneWidth)
    || !Number.isFinite(minSpeed)
    || !Number.isFinite(maxSpeed)
    || viewportRight <= viewportLeft
    || zoneWidth <= 0
    || minSpeed < 0
    || maxSpeed < minSpeed
  ) {
    return IDLE_AUTO_SCROLL;
  }

  const viewportWidth = viewportRight - viewportLeft;
  const safeZoneWidth = Math.min(zoneWidth, viewportWidth / 2);
  if (safeZoneWidth <= 0) return IDLE_AUTO_SCROLL;

  let direction: -1 | 0 | 1 = 0;
  let distanceFromEdge = 0;
  if (pointerX < viewportLeft + safeZoneWidth) {
    direction = -1;
    distanceFromEdge = pointerX - viewportLeft;
  } else if (pointerX > viewportRight - safeZoneWidth) {
    direction = 1;
    distanceFromEdge = viewportRight - pointerX;
  } else {
    return IDLE_AUTO_SCROLL;
  }

  const depth = Math.min(
    1,
    Math.max(0, (safeZoneWidth - distanceFromEdge) / safeZoneWidth),
  );
  const speed = minSpeed + (maxSpeed - minSpeed) * depth;
  if (!Number.isFinite(depth) || !Number.isFinite(speed)) {
    return IDLE_AUTO_SCROLL;
  }
  return { direction, speed, depth };
}

import type { KeyboardEvent, RefObject } from 'react';
import { Text, Textarea } from '@mantine/core';
import { FileText as IconFileText } from 'lucide-react';

export function SessionCardEditor({
  editing,
  note,
  noteValue,
  title,
  textareaRef,
  onEdit,
  onNoteChange,
  onNoteKeyDown,
  onSubmit,
}: {
  editing: boolean;
  note: string;
  noteValue: string;
  title: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onEdit: () => void;
  onNoteChange: (value: string) => void;
  onNoteKeyDown: (event: KeyboardEvent) => void;
  onSubmit: () => void;
}) {
  if (editing) {
    return (
      <Textarea
        ref={textareaRef}
        className="session-card__note"
        name="session-note"
        aria-label={`Session note for ${title}`}
        autoComplete="off"
        value={noteValue}
        onChange={(event) => onNoteChange(event.target.value)}
        onBlur={onSubmit}
        onKeyDown={onNoteKeyDown}
        size="xs"
        minRows={2}
        maxRows={6}
        placeholder="Add a note…"
        autosize
      />
    );
  }

  if (!note) return null;
  return (
    <button
      type="button"
      className="session-card__note"
      onClick={onEdit}
      aria-label={`Edit note for ${title}`}
    >
      <Text size="xs" c="dimmed" lineClamp={2}>
        <IconFileText
          size={12}
          aria-hidden="true"
          style={{
            display: 'inline',
            verticalAlign: 'middle',
            marginRight: 4,
          }}
        />
        {note}
      </Text>
    </button>
  );
}

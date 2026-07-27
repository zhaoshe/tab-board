import { useRef, useState } from 'react';
import {
  Button,
  Group,
  Stack,
  TextInput,
  Textarea,
} from '@mantine/core';
import { ManagerModal } from '../shell/ManagerModal';

export type SessionItemComposerMode = 'link' | 'note';

interface SessionItemComposerProps {
  mode: SessionItemComposerMode;
  onClose: () => void;
  onAddLink: (link: { url: string; title: string }) => void;
  onAddNote: (text: string) => void;
}

export function SessionItemComposer({
  mode,
  onClose,
  onAddLink,
  onAddNote,
}: SessionItemComposerProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    if (mode === 'note') {
      const value = note.trim();
      if (!value) {
        setError('Enter note text.');
        noteRef.current?.focus();
        return;
      }
      onAddNote(value);
      onClose();
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      setError('Enter an HTTP or HTTPS URL.');
      urlRef.current?.focus();
      return;
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      setError('Enter an HTTP or HTTPS URL.');
      urlRef.current?.focus();
      return;
    }
    onAddLink({
      url: parsedUrl.href,
      title: title.trim() || parsedUrl.href,
    });
    onClose();
  };

  return (
    <ManagerModal
      opened
      onClose={onClose}
      title={mode === 'link' ? 'Add Link' : 'Add Note'}
      size="sm"
      centered
    >
      <Stack gap="md">
        {mode === 'link' ? (
          <>
            <TextInput
              ref={urlRef}
              type="url"
              inputMode="url"
              name="session-link-url"
              label="URL"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://example.com…"
              value={url}
              error={error}
              onChange={(event) => {
                setUrl(event.currentTarget.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
              data-autofocus
            />
            <TextInput
              name="session-link-title"
              label="Title"
              description="Optional. The URL is used when left blank."
              autoComplete="off"
              placeholder="Optional title…"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
            />
          </>
        ) : (
          <Textarea
            ref={noteRef}
            name="session-note-text"
            label="Note"
            autoComplete="off"
            placeholder="Write a note…"
            value={note}
            error={error}
            autosize
            minRows={4}
            onChange={(event) => {
              setNote(event.currentTarget.value);
              if (error) setError(null);
            }}
            data-autofocus
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>
            {mode === 'link' ? 'Add Link' : 'Add Note'}
          </Button>
        </Group>
      </Stack>
    </ManagerModal>
  );
}

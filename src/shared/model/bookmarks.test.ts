import { describe, expect, it } from 'vitest';
import { createBookmarkSessions } from './bookmarks';

const timestamp = '2026-08-05T00:00:00.000Z';

describe('createBookmarkSessions', () => {
  it('flattens bookmark folders into read-only sessions with slash paths', () => {
    const sessions = createBookmarkSessions([{
      id: '0',
      title: '',
      children: [{
        id: '10',
        title: '一级文件夹',
        children: [{
          id: '11',
          title: '一级链接',
          url: 'https://one.example/',
          dateAdded: 1000,
        }, {
          id: '12',
          title: '二级文件夹',
          children: [{
            id: '13',
            title: '二级链接',
            url: 'https://two.example/',
            dateAdded: 2000,
          }],
        }],
      }],
    }], {
      timestamp,
      workspaceId: 'workspace-a',
    });

    expect(sessions.map(({ id, title, locked, folderId, starred, archived }) => ({
      id,
      title,
      locked,
      folderId,
      starred,
      archived,
    }))).toEqual([{
      id: 'bookmark-folder-10',
      title: '一级文件夹',
      locked: true,
      folderId: null,
      starred: false,
      archived: false,
    }, {
      id: 'bookmark-folder-12',
      title: '一级文件夹/二级文件夹',
      locked: true,
      folderId: null,
      starred: false,
      archived: false,
    }]);
    expect(sessions[0].tabs.map(({ id, title, url }) => ({ id, title, url }))).toEqual([{
      id: 'bookmark-11',
      title: '一级链接',
      url: 'https://one.example/',
    }]);
    expect(sessions[1].tabs.map(({ id, title, url }) => ({ id, title, url }))).toEqual([{
      id: 'bookmark-13',
      title: '二级链接',
      url: 'https://two.example/',
    }]);
  });

  it('skips empty folders and untitled root containers', () => {
    const sessions = createBookmarkSessions([{
      id: '0',
      title: '',
      children: [{
        id: '1',
        title: '',
        children: [{
          id: '2',
          title: 'Empty',
          children: [],
        }, {
          id: '3',
          title: 'Root Link',
          url: 'https://root.example/',
        }],
      }],
    }], {
      timestamp,
      workspaceId: 'workspace-a',
    });

    expect(sessions.map(({ id, title }) => ({ id, title }))).toEqual([{
      id: 'bookmark-folder-1',
      title: 'Bookmarks',
    }]);
  });
});

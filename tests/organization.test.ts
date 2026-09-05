import { test, expect } from 'bun:test';
import { unpack, withBody, withOrganization, normalizeTag } from '../src/organization';

test('portable tags, colors and pin survive body edits and ordinary exports', () => {
  const source='# Café\n\nA plain Markdown body.\n';
  const marked=withOrganization(source,{tags:['work/ideas','café'],color:'sage',pinned:true});
  expect(unpack(marked).body).toBe(source);
  const changed=withBody(marked,source+'More writing.');
  expect(unpack(changed).organization).toEqual({tags:['work/ideas','café'],color:'sage',pinned:true});
  expect(changed).toContain('<!-- tend-notes ');
});

test('unknown versions and malformed metadata remain editable body text', () => {
  for(const source of ['<!-- tend-notes {"v":2} -->\nKeep me','<!-- tend-notes invalid -->\nKeep me']){
    expect(unpack(source).body).toBe(source);
    expect(withBody(source,source+'\nMore')).toBe(source+'\nMore');
  }
});

test('tag normalization is bounded and supports related topics', () => {
  expect(normalizeTag(' #Work/Ideas ')).toBe('work/ideas');
  expect(normalizeTag('Home plans')).toBe('home-plans');
  expect(()=>normalizeTag('<script>')).toThrow();
  expect(()=>normalizeTag('x'.repeat(33))).toThrow();
});

test('unrecognized metadata fields survive organization edits without breaking comment syntax', () => {
  const source='<!-- tend-notes {"v":1,"tags":[],"color":"none","pinned":false,"custom":"x"} -->\nbody';
  const updated=withOrganization(source,{pinned:true});
  expect(unpack(updated).data.custom).toBe('x');
  expect(unpack(updated).body).toBe('body');
});

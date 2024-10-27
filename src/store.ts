import { writable } from 'svelte/store';

export const _config = writable<any>({});
export const _status = writable<string>('');
export const _logs = writable<string>('');

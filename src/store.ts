import { writable } from 'svelte/store';
import { request } from './model';

export const _config = writable<any>({});
export const _status = writable<string>('');
export const _logs = writable<string>('');

export const getConfig = () => {
  request.get('/getConfig').then(({ data }) => {
    _config.set(data);
    if (!data?.area) {
      _status.set('NOT_CONFIGURED');
    }
  });
};

export const getStatus = () => {
  request.get('/getStatus').then(({ data }) => {
    _status.set(data);
  });
};

export const getLogs = () => {
  request.get('/getLogs').then(({ data }) => {
    _logs.set(data);
  });
};

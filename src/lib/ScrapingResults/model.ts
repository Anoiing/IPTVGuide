import { request } from '@/model';

export const initTask = async () => {
  return await request.get('/api/initTask');
};

export const runOnce = async () => {
  return await request.get('/api/runOnce');
};

export const cancel = async () => {
  return await request.get('/api/cancel');
};

export const addBlacklist = async (value: string) => {
  return await request.get(`/addBlacklist?value=${value}`);
};

import { request } from '@/model';

export const initTask = async () => {
  return await request.get('/initTask');
};

export const runOnce = async () => {
  return await request.get('/runOnce');
};

export const cancel = async () => {
  return await request.get('/cancel');
};

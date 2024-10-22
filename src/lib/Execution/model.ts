import { request } from '@/model';

export const getStatus = async () => {
  return await request.get('/getStatus');
};

export const runOnce = async () => {
  return await request.get('/runOnce');
};

export const cancel = async () => {
  return await request.get('/cancel');
};

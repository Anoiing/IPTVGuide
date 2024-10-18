import { request } from '@/model';

export const init = async () => {
  return await request.get('/init');
};

import { request } from '@/model';

export const verifierCron = async (value: string) => {
  return await request.get('/api/verifierCron', { value });
};

export const saveConfig = async (value: any) => {
  return await request.post('/api/saveConfig', value);
};

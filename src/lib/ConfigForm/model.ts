import { request } from '@/model';

export const getConfig = async () => {
  return await request.get('/getConfig');
};

export const verifierCron = async (value: string) => {
  return await request.get('/verifierCron', { value });
};

export const saveConfig = async (value: any) => {
  return await request.post('/saveConfig', value);
};

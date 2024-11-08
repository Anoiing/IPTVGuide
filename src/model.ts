import { _config, _logs, _status } from './store';
import axios from 'axios';
import qs from 'querystringify';

export const request = {
  get: async (url: string, queries?: any) => {
    const response = await axios.get(`${url}${qs.stringify(queries, true)}`);
    return response.data;
  },
  post: async (url: string, body: any) => {
    const response = await axios.post(`${url}`, body, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  },
};

export const getConfig = () => {
  request.get('/api/getConfig').then(({ data }) => {
    _config.set(data);
    if (!data?.area) {
      _status.set('NOT_CONFIGURED');
    }
  });
};

export const getStatus = () => {
  request.get('/api/getStatus').then(({ data }) => {
    _status.set(data);
  });
};

export const getLogs = () => {
  request.get('/api/getLogs').then(({ data }) => {
    _logs.set(data);
  });
};

export const verifierCron = async (value: string) => {
  return await request.get('/api/verifierCron', { value });
};

export const saveConfig = async (value: any) => {
  return await request.post('/api/saveConfig', value);
};

export const runOnce = async () => {
  return await request.get('/api/runOnce');
};

export const cancel = async () => {
  return await request.get('/api/cancel');
};

export const addBlacklist = async (value: string) => {
  return await request.get(`/api/addBlacklist?value=${value}`);
};

export const clearLog = async () => {
  return await request.get('/api/clearLog');
};

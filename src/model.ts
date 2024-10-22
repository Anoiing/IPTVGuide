import axios from 'axios';
import qs from 'querystringify';

export const request = {
  get: async (url: string, queries?: any) => {
    const response = await axios.get(
      `http://localhost:5174${url}${qs.stringify(queries, true)}`
    );
    return response.data;
  },
  post: async (url: string, body: any) => {
    const response = await axios.post(`http://localhost:5174${url}`, body, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  },
};

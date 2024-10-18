import Toast from './Toast.svelte';

const error = (message: string, timeout: number = 2000) => {
  const ele = new Toast({
    target: document.getElementById('app')!,
    props: { type: 'error', message },
  });
  window.setTimeout(() => ele.$destroy(), timeout);
};
const success = (message: string, timeout: number = 2000) => {
  const ele = new Toast({
    target: document.getElementById('app')!,
    props: { type: 'success', message },
  });
  window.setTimeout(() => ele.$destroy(), timeout);
};

const warning = (message: string, timeout: number = 2000) => {
  const ele = new Toast({
    target: document.getElementById('app')!,
    props: { type: 'warning', message },
  });
  window.setTimeout(() => ele.$destroy(), timeout);
};

export default { success, error, warning };

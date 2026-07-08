export type ToastTone = 'success' | 'error' | 'warning' | 'info';
export type ToastIcon = ToastTone | 'browser' | 'database' | 'model' | 'task';

export type ToastInput = {
  tone: ToastTone;
  text: string;
  icon?: ToastIcon;
};

export type ToastNotice = ToastInput & {
  id: number;
};

export type Notify = (notice: ToastInput) => void;

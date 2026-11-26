import {api} from './api';
export const notificationService={list:()=>api('/notifications'),async browser(title:string){if(!('Notification' in window))return;if(Notification.permission==='default')await Notification.requestPermission();if(Notification.permission==='granted')new Notification(title)}};

const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hanama', {
  performanceEnabled: process.argv.includes('--hanama-performance'),
  performanceEvent: value => {if(process.argv.includes('--hanama-performance'))ipcRenderer.send('hanama:performance',value);},
  invoke: (action, payload) => ipcRenderer.invoke('hanama', action, payload),
  onQuality: callback => {const fn=(_e,data)=>callback(data);ipcRenderer.on('hanama:quality',fn);return ()=>ipcRenderer.removeListener('hanama:quality',fn);},
  onTagInsert: callback => {const fn=(_e,data)=>callback(data);ipcRenderer.on('hanama:tag-insert',fn);return ()=>ipcRenderer.removeListener('hanama:tag-insert',fn);},
  onBookJob: callback => {const listener=(_event,value)=>callback(value);ipcRenderer.on('hanama:book-job',listener);return ()=>ipcRenderer.removeListener('hanama:book-job',listener);},
  onConsole: callback => {const listener=(_event,entry)=>callback(entry);ipcRenderer.on('hanama:console',listener);return ()=>ipcRenderer.removeListener('hanama:console',listener);},
  onState: callback => {const fn=(_e,data)=>callback(data);ipcRenderer.on('hanama:state',fn);return ()=>ipcRenderer.removeListener('hanama:state',fn);},
  onSave: callback => {const fn=(_e,data)=>callback(data);ipcRenderer.on('hanama:save',fn);return ()=>ipcRenderer.removeListener('hanama:save',fn);},
  onBusy: callback => {const fn=(_e,data)=>callback(data);ipcRenderer.on('hanama:busy',fn);return ()=>ipcRenderer.removeListener('hanama:busy',fn);},
  onPanelClosed: callback => {const fn=(_e,data)=>callback(data);ipcRenderer.on('hanama:panel-closed',fn);return ()=>ipcRenderer.removeListener('hanama:panel-closed',fn);},
  onImageLocation: callback => {const fn=(_e,data)=>callback(data);ipcRenderer.on('hanama:image-location',fn);return ()=>ipcRenderer.removeListener('hanama:image-location',fn);},
  onPick: callback => {const fn=(_e,data)=>callback(data);ipcRenderer.on('hanama:pick',fn);return ()=>ipcRenderer.removeListener('hanama:pick',fn);},
  onSelection: callback => {const fn=(_e,data)=>callback(data);ipcRenderer.on('hanama:selection',fn);return ()=>ipcRenderer.removeListener('hanama:selection',fn);},
});

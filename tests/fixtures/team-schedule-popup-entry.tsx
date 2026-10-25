import React from 'react';
import { createRoot } from 'react-dom/client';
import ScheduleScreen from '../../src/app/team/schedule';
const root = createRoot(document.getElementById('root')!);
let version = 0;
(window as any).mountPopupFixture = (options = {}) => {
  window.popupFixture = { complete: false, calls: 0, navigationCount: 0, ...options };
  root.render(<ScheduleScreen key={++version} />);
};
(window as any).updatePopupFixture = (options = {}) => {
  Object.assign(window.popupFixture, options);
  root.render(<ScheduleScreen key={version} />);
};
(window as any).mountPopupFixture();

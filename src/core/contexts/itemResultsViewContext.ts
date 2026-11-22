import React, { createContext } from 'react';

export type ItemResultsView = 'cards' | 'table';

export const ItemResultsViewContext = createContext<{
  view: ItemResultsView;
  setView: (view: ItemResultsView) => void;
}>({
  view: 'cards',
  setView: () => {},
});

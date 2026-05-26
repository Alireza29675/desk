import type { ComponentTypePlugin } from '@desk/types';
import { calloutComponent } from './callout';
import { chartComponent } from './chart';
import { checkboxComponent } from './checkbox';
import { codeViewComponent } from './code-view';
import { diagramComponent } from './diagram';
import { folderStructureComponent } from './folder-structure';
import { iframeComponent } from './iframe';
import { imageComponent } from './image';
import { mathComponent } from './math';
import { mindmapComponent } from './mindmap';
import { quoteComponent } from './quote';
import { tableComponent } from './table';
import { timelineComponent } from './timeline';
import { youtubeEmbedComponent } from './youtube-embed';

export {
  calloutComponent,
  chartComponent,
  checkboxComponent,
  codeViewComponent,
  diagramComponent,
  folderStructureComponent,
  iframeComponent,
  imageComponent,
  mathComponent,
  mindmapComponent,
  quoteComponent,
  tableComponent,
  timelineComponent,
  youtubeEmbedComponent,
};

// biome-ignore lint/suspicious/noExplicitAny: a plugin collection is heterogeneous in component data type
export const builtinComponentTypes: ComponentTypePlugin<any>[] = [
  diagramComponent,
  chartComponent,
  folderStructureComponent,
  codeViewComponent,
  quoteComponent,
  imageComponent,
  youtubeEmbedComponent,
  iframeComponent,
  tableComponent,
  mathComponent,
  calloutComponent,
  checkboxComponent,
  mindmapComponent,
  timelineComponent,
];

export const BUILTIN_COMPONENT_TYPE_NAMES = builtinComponentTypes.map((c) => c.type);

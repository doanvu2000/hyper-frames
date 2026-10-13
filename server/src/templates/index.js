import titleCard from './title-card.js';
import statCountup from './stat-countup.js';
import lowerThird from './lower-third.js';
import featureList from './feature-list.js';

export const templates = [titleCard, statCountup, lowerThird, featureList];

export const templateCatalog = () =>
  templates.map(({ id, name, summary, duration, fields }) => ({ id, name, summary, duration, fields }));

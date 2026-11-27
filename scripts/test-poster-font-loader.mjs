import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleFontsCss2Url,
  getFontLoadSampleText,
  parseFontWeights,
  resolveClosestFontWeight,
} from '../src/components/leaderboard/PosterStudio/Utils/googleFontCss2.ts';

test('parseFontWeights normalizes, deduplicates, and sorts weight lists safely', () => {
  assert.deepEqual(parseFontWeights('700, 400, 300, 400'), [300, 400, 700]);
  assert.deepEqual(parseFontWeights('400'), [400]);
  assert.deepEqual(parseFontWeights(''), [400]);
  assert.deepEqual(parseFontWeights(undefined), [400]);
});

test('resolveClosestFontWeight clamps single-weight display fonts like Bebas Neue to 400', () => {
  assert.equal(resolveClosestFontWeight(600, '400'), 400);
  assert.equal(resolveClosestFontWeight('bold', '400'), 400);
  assert.equal(resolveClosestFontWeight(600, '300,400,500,600,700'), 600);
  assert.equal(resolveClosestFontWeight(800, '400,700'), 700);
  assert.equal(resolveClosestFontWeight(200, '300,400,700'), 300);
});

test('buildGoogleFontsCss2Url formats single-weight and multi-weight Google Fonts CSS2 URLs', () => {
  assert.equal(
    buildGoogleFontsCss2Url('Bebas Neue', '400'),
    'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
  );
  assert.equal(
    buildGoogleFontsCss2Url('Poppins', '300,400,500,600,700'),
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  );
  assert.equal(
    buildGoogleFontsCss2Url('Noto Serif Malayalam', '300,400,500,600,700'),
    'https://fonts.googleapis.com/css2?family=Noto+Serif+Malayalam:wght@300;400;500;600;700&display=swap',
  );
});

test('getFontLoadSampleText returns Malayalam glyphs for Malayalam fonts and Latin for English fonts', () => {
  assert.match(getFontLoadSampleText('Malayalam'), /[\u0D00-\u0D7F]/);
  assert.equal(getFontLoadSampleText('Display / Poster'), 'BESbswy 123');
});

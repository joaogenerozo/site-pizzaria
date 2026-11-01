import { describe, it, expect } from 'vitest';
import { analyticsEnabled, track, gaItem } from '../../src/lib/analytics.js';

describe('analytics (GA4)', () => {
  it('fica desligado sem VITE_GA4_ID e track não faz nada', () => {
    expect(analyticsEnabled).toBe(false);
    expect(() => track('view_item', {})).not.toThrow();
    expect(globalThis.dataLayer).toBeUndefined();
  });

  it('monta o item no formato do GA4 sem dados do cliente', () => {
    const catalog = {
      products: new Map([['p1', { id: 'p1', slug: 'pizza-calabresa', name: 'Calabresa', category_id: 'c1', fromCents: 3700, sizes: [{ id: 's1', name: 'G' }] }]]),
      categories: [{ id: 'c1', name: 'Pizzas de calabresa' }],
    };
    expect(gaItem(catalog, { productId: 'p1', sizeId: 's1', quantity: 2, notes: 'sem cebola' }, 11000)).toEqual({
      item_id: 'pizza-calabresa', item_name: 'Calabresa', item_category: 'Pizzas de calabresa', item_variant: 'G', price: 55, quantity: 2,
    });
    expect(gaItem(catalog, { productId: 'p1' })).toMatchObject({ price: 37, quantity: 1, item_variant: undefined });
    expect(gaItem(catalog, { productId: 'x' })).toBeNull();
  });
});

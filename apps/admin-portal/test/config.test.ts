import tailwindConfig from '../tailwind.config';

describe('Tailwind Configuration', () => {
  it('should have extended color palette', () => {
    // Note: current config uses presets, so theme.extend might be undefined
    // This test should fail initially - that's expected in TDD
    expect(tailwindConfig.theme?.extend?.colors?.primary).toBeDefined();
    expect(tailwindConfig.theme?.extend?.colors?.primary?.[500]).toBe('#0ea5e9');
  });

  it('should have custom font families', () => {
    expect(tailwindConfig.theme?.extend?.fontFamily?.display).toBeDefined();
    expect(tailwindConfig.theme?.extend?.fontFamily?.display).toContain('Space Grotesk');
  });

  it('should have animation definitions', () => {
    expect(tailwindConfig.theme?.extend?.animation?.shimmer).toBeDefined();
  });
});
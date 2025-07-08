import { greet } from '../src';

describe('Hazard Risk Simple Tests', () => {
  describe('greet', () => {
    it('should return greeting message', () => {
      const result = greet('World');
      expect(result).toBe('Hello World from hazard-risk!');
    });

    it('should work with empty string', () => {
      const result = greet('');
      expect(result).toBe('Hello  from hazard-risk!');
    });
  });
});

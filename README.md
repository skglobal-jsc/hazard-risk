# Hazard Risk

A simple TypeScript library for testing publish, build, and test functionality.

## Installation

```bash
npm install hazard-risk
```

## Usage

### Basic Risk Calculation

```typescript
import { calculateRisk } from 'hazard-risk';

const result = calculateRisk(0.3, 7);
console.log(result);
// Output:
// {
//   score: 2.1,
//   level: 'MEDIUM'
// }
```

### Greeting Function

```typescript
import { greet } from 'hazard-risk';

const message = greet('World');
console.log(message);
// Output: "Hello World from hazard-risk!"
```

## API Reference

### Functions

#### `calculateRisk(probability: number, severity: number): { score: number; level: string }`
Calculates risk score based on probability and severity.

**Parameters:**
- `probability`: Probability of hazard (0-1)
- `severity`: Severity level (1-10)

**Returns:** Object with score and risk level

#### `greet(name: string): string`
Returns a greeting message.

**Parameters:**
- `name`: Name to greet

**Returns:** Greeting string

## Risk Levels

- **LOW** (score ≤ 2)
- **MEDIUM** (score ≤ 5)
- **HIGH** (score ≤ 8)
- **CRITICAL** (score > 8)

## Development

### Install dependencies
```bash
npm install
```

### Run tests
```bash
npm test
```

### Build package
```bash
npm run build
```

### Publish to npm
```bash
npm publish
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

SK-Global - [GitHub](https://github.com/skglobal-jsc)

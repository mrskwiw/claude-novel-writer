/**
 * Example: Interactive Character and Location Creation
 * Shows how to use the builders with a simple CLI prompt function
 */

import { NovelWriterExtension } from '../src/index.js';
import * as readline from 'readline';

/**
 * Simple CLI prompt function using Node.js readline
 */
function createCLIPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return async (
    message: string,
    options: {
      required?: boolean;
      default?: string;
      multiline?: boolean;
      validate?: (value: string) => boolean;
    } = {}
  ): Promise<string> => {
    const prompt = options.default
      ? `${message} [${options.default}]: `
      : `${message}: `;

    if (options.multiline) {
      console.log(
        `${message} (Enter empty line to finish, or type on multiple lines):`
      );
      const lines: string[] = [];

      while (true) {
        const line = await new Promise<string>((resolve) => {
          rl.question('  ', resolve);
        });

        if (line === '') {
          break;
        }

        lines.push(line);
      }

      return lines.join('\n');
    }

    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        const value = answer.trim() || options.default || '';

        // Validation
        if (options.required && !value) {
          console.log('This field is required.');
          resolve(
            createCLIPrompt()(message, options) as Promise<string>
          );
          return;
        }

        if (options.validate && value && !options.validate(value)) {
          console.log('Invalid value. Please try again.');
          resolve(
            createCLIPrompt()(message, options) as Promise<string>
          );
          return;
        }

        resolve(value);
      });
    });
  };
}

async function main() {
  const projectPath = './my-novel';
  const ext = new NovelWriterExtension(projectPath);

  // Initialize project (if needed)
  try {
    await ext.initialize({
      title: 'My Novel',
      author: 'Author Name',
      projectPath,
    });
  } catch (error) {
    // Project might already exist
    ext.setProjectId(1);
  }

  // Create CLI prompt function
  const prompt = createCLIPrompt();

  console.log('=== Novel Element Creator ===\n');
  console.log('What would you like to create?');
  console.log('1. Character');
  console.log('2. Location');
  console.log('3. Exit\n');

  const choice = await prompt('Enter choice (1-3)');

  switch (choice) {
    case '1':
      console.log('\n');
      await ext.createCharacterInteractive(prompt);
      console.log('\nCharacter created and synced to database!');
      break;

    case '2':
      console.log('\n');
      await ext.createLocationInteractive(prompt);
      console.log('\nLocation created and synced to database!');
      break;

    case '3':
      console.log('Goodbye!');
      break;

    default:
      console.log('Invalid choice');
  }

  process.exit(0);
}

// Run example
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

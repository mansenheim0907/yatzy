import {defineConfig} from 'vite';

export default defineConfig(({command,isPreview}) => ({
  // Both the built site and its preview live beneath /yatzy/; local dev stays at /.
  base: command === 'build' || isPreview ? '/yatzy/' : '/',
}));

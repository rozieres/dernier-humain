import '../src/core/fonts.js';
import { boot, BOOT_ORDER } from '../src/boot.js';

boot({ systems: BOOT_ORDER.filter((n) => !n.startsWith('zone:')), zones: ['hub'] });

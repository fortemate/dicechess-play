export type Theme =
	'dark' | 'light' | 'dracula' | 'nord' | 'solarized-dark' | 'tokyo-night' | 'gruvbox';

const metaColors: Record<Theme, string> = {
	dark: '#020617',
	light: '#f8fafc',
	dracula: '#282a36',
	nord: '#2e3440',
	'solarized-dark': '#002b36',
	'tokyo-night': '#1a1b26',
	gruvbox: '#282828',
};

class ThemeStore {
	theme = $state<Theme>('dark');

	constructor() {
		if (typeof window !== 'undefined') {
			let stored: string | null = null;
			try {
				stored = localStorage.getItem('dicechess-theme');
			} catch (_e) {
				// Ignored
			}

			if (stored && stored in metaColors) {
				this.theme = stored as Theme;
			} else {
				this.theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
			}
			this.applyTheme(this.theme);
		}
	}

	setTheme(newTheme: Theme) {
		this.theme = newTheme;
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem('dicechess-theme', newTheme);
			} catch (_e) {
				// Ignored
			}
			this.applyTheme(newTheme);
		}
	}

	private applyTheme(theme: Theme) {
		if (typeof document !== 'undefined') {
			document.documentElement.setAttribute('data-theme', theme);
			const metaTag = document.getElementById('theme-color-meta');
			if (metaTag && metaColors[theme]) {
				metaTag.setAttribute('content', metaColors[theme]);
			}
		}
	}
}

export const themeStore = new ThemeStore();

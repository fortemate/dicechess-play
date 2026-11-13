/** The isolated laboratory entry: no main-site layout, service worker, account, bot or outbox. */
import { mount } from 'svelte';
import { LaboratoryApi } from '../lib/laboratory/api';
import LaboratoryApp from './LaboratoryApp.svelte';
import './laboratory.css';

declare const __LAB_API_ORIGIN__: string;
declare const __LAB_RULES_VERSION__: string;

mount(LaboratoryApp, {
	target: document.getElementById('laboratory')!,
	props: { api: new LaboratoryApi(__LAB_API_ORIGIN__, __LAB_RULES_VERSION__) },
});

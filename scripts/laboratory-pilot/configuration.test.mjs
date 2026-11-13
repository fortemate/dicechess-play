/** Exercise unsafe rendered Compose overrides without Docker, certificates, or credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRehearsal, IMAGES, APP_ORIGIN } from './configuration.mjs';

function fixture() {
	const project = 'lab229-test';
	const service = (name, networks) => ({
		image: IMAGES[name],
		user: name === 'db' ? '70:70' : '10001:10001',
		read_only: true,
		restart: 'no',
		cap_drop: ['ALL'],
		security_opt: ['no-new-privileges:true'],
		networks: Object.fromEntries(networks.map((network) => [network, null])),
	});
	return {
		name: project,
		services: {
			gateway: {
				...service('gateway', ['edge', 'ingress']),
				ports: [8443, 9443].map((port) => ({
					host_ip: '127.0.0.1',
					published: String(port),
					target: port,
				})),
			},
			api: {
				...service('api', ['database', 'edge']),
				environment: {
					PLAY_RUNTIME_MODE: 'laboratory',
					LAB_DB_URL: 'jdbc:postgresql://db:5432/laboratory',
					LAB_DB_USER: 'laboratory_app',
					LAB_FRONTEND_ORIGIN: APP_ORIGIN,
					LAB_ADMISSION_OPEN: 'false',
				},
			},
			db: service('db', ['database']),
		},
		networks: Object.fromEntries(
			['database', 'edge', 'ingress'].map((name) => [
				name,
				{ internal: name !== 'ingress', name: `${project}_${name}` },
			]),
		),
		volumes: { 'laboratory-data': { name: `${project}_laboratory-data` } },
		secrets: { test: { file: '/private/generated/file' } },
	};
}

test('accepts a closed, loopback-only, pinned rehearsal', () => {
	assert.equal(validateRehearsal(fixture(), 'lab229-test').name, 'lab229-test');
});

for (const [name, mutate] of [
	[
		'public binding',
		(c) => {
			c.services.gateway.ports[0].host_ip = '0.0.0.0';
		},
	],
	[
		'raw database publishing',
		(c) => {
			c.services.db.ports = [{ published: '5432', target: 5432 }];
		},
	],
	[
		'mutable image',
		(c) => {
			c.services.api.image = 'ghcr.io/fortemate/dicechess-play-api:latest';
		},
	],
	[
		'network egress',
		(c) => {
			c.networks.edge.internal = false;
		},
	],
	[
		'shared volume',
		(c) => {
			c.volumes['laboratory-data'].name = 'shared-data';
		},
	],
	[
		'open admission',
		(c) => {
			c.services.api.environment.LAB_ADMISSION_OPEN = 'true';
		},
	],
	[
		'main service fallback',
		(c) => {
			c.services.api.environment.PLAY_RUNTIME_MODE = 'classic';
		},
	],
	[
		'password interpolation',
		(c) => {
			c.services.db.environment = { POSTGRES_PASSWORD: String(0) };
		},
	],
	[
		'host networking',
		(c) => {
			c.services.api.network_mode = 'host';
		},
	],
]) {
	test(`refuses ${name} before creating resources`, () => {
		const config = fixture();
		mutate(config);
		assert.throws(() => validateRehearsal(config, 'lab229-test'));
	});
}

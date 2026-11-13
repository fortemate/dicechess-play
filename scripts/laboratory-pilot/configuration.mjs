/** Reject a rehearsal that could publish a service, reuse shared storage, or drift from its pins. */
import assert from 'node:assert/strict';

export const SERVER_REVISION = 'e3254bbc022b02a1635075f62c57d8ab6d410f54';
export const IMAGES = {
	gateway:
		'caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0',
	api: 'ghcr.io/fortemate/dicechess-play-api@sha256:b37cc8afa7c78c4cead049eab1214085c871944c3cdae5d380808327c9c935ff',
	db: 'postgres:18.6-alpine@sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5',
};
export const APP_ORIGIN = 'https://localhost:8443';
export const API_ORIGIN = 'https://localhost:9443';

export function validateRehearsal(config, project) {
	assert.match(project, /^lab229-[a-z0-9-]+$/);
	assert.equal(config.name, project);
	assert.deepEqual(Object.keys(config.services).sort(), ['api', 'db', 'gateway']);
	for (const [name, service] of Object.entries(config.services)) {
		assert.equal(service.image, IMAGES[name], 'Image must match the reviewed immutable pin');
		assert.equal(service.user, name === 'db' ? '70:70' : '10001:10001');
		assert.equal(service.read_only, true);
		assert.equal(service.restart, 'no');
		assert.deepEqual(service.cap_drop, ['ALL']);
		assert.ok(service.security_opt.includes('no-new-privileges:true'));
		assert.equal(service.privileged ?? false, false);
		assert.equal(service.network_mode, undefined);
		assert.equal(service.container_name, undefined);
		assert.equal(service.build, undefined);
		assert.ok(
			!Object.keys(service.environment ?? {}).some((key) => /TOKEN|SECRET|PASSWORD$/.test(key)),
		);
		if (name !== 'gateway')
			assert.equal(service.ports, undefined, 'Only the TLS gateway publishes ports');
	}
	const ports = config.services.gateway.ports;
	assert.equal(ports.length, 2);
	for (const [index, port] of ports.entries()) {
		assert.equal(port.host_ip, '127.0.0.1');
		assert.equal(String(port.published), index === 0 ? '8443' : '9443');
		assert.equal(port.target, index === 0 ? 8443 : 9443);
	}
	assert.deepEqual(Object.keys(config.networks).sort(), ['database', 'edge', 'ingress']);
	for (const [name, network] of Object.entries(config.networks)) {
		assert.equal(network.internal ?? false, name !== 'ingress');
		assert.equal(network.external ?? false, false);
		assert.equal(network.name, `${project}_${name}`);
	}
	assert.deepEqual(Object.keys(config.services.db.networks), ['database']);
	assert.deepEqual(Object.keys(config.services.gateway.networks).sort(), ['edge', 'ingress']);
	assert.deepEqual(Object.keys(config.services.api.networks).sort(), ['database', 'edge']);
	const volumes = Object.values(config.volumes);
	assert.equal(volumes.length, 1);
	assert.equal(volumes[0].name, `${project}_laboratory-data`);
	assert.equal(volumes[0].external ?? false, false);
	const api = config.services.api.environment;
	assert.equal(api.PLAY_RUNTIME_MODE, 'laboratory');
	assert.equal(api.LAB_DB_URL, 'jdbc:postgresql://db:5432/laboratory');
	assert.equal(api.LAB_DB_USER, 'laboratory_app');
	assert.equal(api.LAB_FRONTEND_ORIGIN, APP_ORIGIN);
	assert.equal(api.LAB_ADMISSION_OPEN, 'false', 'Start every rehearsal with admission closed');
	for (const secret of Object.values(config.secrets)) {
		assert.ok(secret.file);
		assert.equal(secret.external ?? false, false);
	}
	return config;
}

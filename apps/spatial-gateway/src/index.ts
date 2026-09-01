import { SpatialGateway } from './gateway.js';

const gateway = new SpatialGateway({
  wsPort: parseInt(process.env.WS_PORT || '8080', 10),
  multicastIp: process.env.MULTICAST_IP || '239.255.0.1',
  multicastPort: parseInt(process.env.MULTICAST_PORT || '8888', 10),
  enableSyntheticFallback: true
});

gateway.start();

process.on('SIGINT', () => {
  console.log('\n[SpatialGateway] Shutting down gracefully...');
  gateway.stop();
  process.exit(0);
});

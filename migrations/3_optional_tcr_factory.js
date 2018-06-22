/* global artifacts */

/* This migration deploys the TCR Factory and its constituent contracts, and should only be
 * executed when the network is either "test" or "coverage". In production, the TCR should be
 * deployed from a well-known mainnet factory.
 */

const DLL = artifacts.require('dll/DLL.sol');
const AttributeStore = artifacts.require('attrstore/AttributeStore.sol');
const PLCRFactory = artifacts.require('plcr-revival/PLCRFactory.sol');
const ParameterizerFactory = artifacts.require('tcr/ParameterizerFactory.sol');
const RegistryFactory = artifacts.require('tcr/RegistryFactory.sol');

module.exports = (deployer, network) => {
  if (network === 'test' || network === 'coverage') {
    deployer.deploy(DLL);
    deployer.deploy(AttributeStore);

    deployer.link(DLL, PLCRFactory);
    deployer.link(AttributeStore, PLCRFactory);

    return deployer.deploy(PLCRFactory)
      .then(() => deployer.deploy(ParameterizerFactory, PLCRFactory.address))
      .then(() => deployer.deploy(RegistryFactory, ParameterizerFactory.address));
  }

  return deployer;
};


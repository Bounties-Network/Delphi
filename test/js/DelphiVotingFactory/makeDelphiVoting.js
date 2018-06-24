/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVotingFactory = artifacts.require('DelphiVotingFactory.sol');
const DelphiVoting = artifacts.require('DelphiVoting.sol');
const DemocraticParameterizer =
  artifacts.require('democratic-parameterizer/DemocraticParameterizer.sol');

const web3 = require('web3');

const solkeccak = web3.utils.soliditySha3;

contract('DelphiVotingFactory', () => {
  describe('Function: makeDelphiVoting', () => {
    let dvf;

    beforeEach(async () => {
      dvf = await DelphiVotingFactory.deployed();
    });

    it('should deploy a new DelphiVoting contract with a 100 second voting period', async () => {
      const receipt = await dvf.makeDelphiVoting(2666, [solkeccak('parameterizerVotingPeriod')],
        [100]);
      const dv = DelphiVoting.at(receipt.logs[0].args.delphiVoting);
      const dp = DemocraticParameterizer.at(await dv.parameterizer.call());

      const storedPVP = await dp.get.call('parameterizerVotingPeriod');
      assert.strictEqual(storedPVP.toString(10), '100', 'The DelphiVoting contract was not ' +
        'initialized correctly.');

      const storedAS = await dv.arbiterSet.call();
      assert.strictEqual(parseInt(storedAS, 16), 2666, 'The DelphiVoting contract was not ' +
        'initialized with the correct arbiter set address');
    });
  });
});


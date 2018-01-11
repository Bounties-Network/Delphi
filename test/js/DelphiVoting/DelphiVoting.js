/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const Registry = artifacts.require('Registry');
const Parameterizer = artifacts.require('Parameterizer');

contract('DelphiVoting', () => {
  describe('Function: DelphiVoting', () => {
    it('should instantiate the contract with the expected values', async () => {
      const dv = await DelphiVoting.deployed();

      const storedArbiterSet = await dv.arbiterSet.call();
      assert.strictEqual(storedArbiterSet, Registry.address,
        'the arbiter set was not initialized properly');

      const storedParameterizer = await dv.parameterizer.call();
      assert.strictEqual(storedParameterizer, Parameterizer.address,
        'the parameterizer was not initialized properly');
    });
  });
});


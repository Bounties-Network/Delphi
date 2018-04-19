/* eslint-env mocha */
/* global contract artifacts assert  */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: whitelistClaimant', () => {
    const [staker, , arbiter] = accounts;

    it('should revert if called by anyone but the staker');
    it('should properly set the _claimant address to true');
    it('should emit ClaimantWhitelisted event');
  });
});

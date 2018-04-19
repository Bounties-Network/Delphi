/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');

const conf = utils.getConfig();

const BN = require('bignumber.js');

contract('DelphiStake', (accounts) => {
  describe('Function: increaseClaimDeadline', () => {
    it('should revert if called by anyone but the staker');
    it('should revert if the _newClaimDeadline is not later than the current claim deadline');
    it('should set the claim deadline to the _newClaimDeadline');
    it('should emit a ClaimDeadlineIncreased event');
  });
});

/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./conf/registryConfig.json'));

contract('DelphiVoting', (accounts) => {
  describe('Function: submitRuling', () => {
    it('should allow anyone to submit a ruling (non-voters)');
    it('should revert if the claimId generated from the stake address and claim number doesnt exist');
    it('should revert if the commit period is active');
    it('should revert if the reveal period is active');
    it('should correctly tally the votes');
    it('should correctly rule on the claim in the stake');
  });
});

/* eslint-env mocha */
/* global contract */


contract('DelphiStake', (accounts) => {//eslint-disable-line
  describe('Function: whitelistClaimant', () => {
    it('should revert if called by anyone but the staker');
    it('should properly set the _claimant address to true');
    it('should emit ClaimantWhitelisted event');
  });
});

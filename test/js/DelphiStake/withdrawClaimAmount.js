/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: withdrawClaimAmount', () => {
    it('should revert if called by any other than the claim\'s claimant');
    it('should revert if the claim has not been ruled');
    it('should revert if the claim was not accepted');
    it('should revert if the claim has already been paid');
    it('should set the claim\'s paid property to true');
    it('should transfer the claim amount plus the fee to the claimant');
    it('should emit a ClaimWithdrawn event');
  });
});


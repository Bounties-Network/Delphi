/* eslint-env mocha */
/* global contract  */

contract('DelphiStake', (accounts) => {// eslint-disable-line
  describe('Function: increaseClaimDeadline', () => {
    it('should revert if called by anyone but the staker');
    it('should revert if the _newClaimDeadline is not later than the current claim deadline');
    it('should set the claim deadline to the _newClaimDeadline');
    it('should emit a ClaimDeadlineIncreased event');
  });
});

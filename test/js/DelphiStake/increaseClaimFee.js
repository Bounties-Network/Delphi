/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: increaseClaimFee', () => {
    it('should revert if called with an out-of-bounds claimId');
    it('should revert if called on a claim which has already been ruled upon');
    it('should revert if settlement has not yet failed');
    it('should transfer the increase _amount from the sender to the contract');
    it('should increase the surplus fee by the _amount');
    it('should emit a WithdrawFinalized event');
    it('should emit a FeeIncreased event');
  });
});

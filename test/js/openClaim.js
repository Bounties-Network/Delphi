/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: openClaim', () => {
    it('should not allow the arbiter to open a claim');
    it('should not allow the staker to open a claim');
    it('should revert if _amount + _fee is less than the available stake');
    it('should add a new claim to the claims array');
    it('should increment the openClaims counter');
    it('should decrement the stakers stake by amount + fee');
    it('should set lockup remaining to lockupEnding - now');
    it('should set lockupEnding to zero');
    it('should emit a NewClaim event');
    it('should append claims to the end of the claim array, without overwriting earlier claims');
  });
});


/* eslint-env mocha */
/* global contract */

contract('DelphiStake', () => {
  describe('Function: increaseStake', () => {
    it('should revert if called by any entity other than the staker');
    it('should revert if _value does not equal msg.value');
    it('should increment stake by _value');
    it('should emit a StakeIncreased event');
  });
});


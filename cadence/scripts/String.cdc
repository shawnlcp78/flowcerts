import FilePrivilegesContract from 0x02

pub fun main(): Int {
  var acct = getAccount(0x05)
  log(acct.getCapability<&FilePrivilegesContract.AccountTokenCollection>(/public/filePrivileges).borrow()?.getAccountAddress())
  log(acct.getCapability<&FilePrivilegesContract.AccountTokenCollection>(/public/filePrivileges).borrow()?.getAccountAddress() == "043c0x04")
  return 1
}

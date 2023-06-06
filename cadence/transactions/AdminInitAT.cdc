// to be signed by Admin
import FileNFTContract from 0xFileNFTContract
import FilePrivilegesContract from 0xFilePrivilegesContract

transaction(address: Address) {
  prepare(acct: AuthAccount) {
    let receiverAcct = getAccount(address)
    let receiver = receiverAcct
      .getCapability(/public/filePrivileges)
      .borrow<&AnyResource{FilePrivilegesContract.AccountTokenCollectionPublic}>()
      ?? panic("Unable to borrow AccountTokenCollectionPublic")

    receiver.setAccountToken(
      adminCapability: acct.borrow<&FilePrivilegesContract.FileAdminIndicator>(from: /storage/fileAdminIndicator)!,
      accountToken: <- FilePrivilegesContract.mintAccountToken(
        adminCapability: acct.borrow<&FilePrivilegesContract.FileAdminIndicator>(from: /storage/fileAdminIndicator)!,
        address: address.toString()
      )
    )
  }
}

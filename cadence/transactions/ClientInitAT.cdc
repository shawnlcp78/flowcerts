// to be signed by Client
import FileNFTContract from 0xFileNFTContract
import FilePrivilegesContract from 0xFilePrivilegesContract

transaction {
  prepare(acct: AuthAccount) {
    acct.save(<- FilePrivilegesContract.createEmptyCollection(), to: /storage/filePrivileges)

    // expose through restricted interface
    acct.link<&AnyResource{FilePrivilegesContract.AccountTokenCollectionPublic}>(/public/filePrivileges, target: /storage/filePrivileges)
  }
}

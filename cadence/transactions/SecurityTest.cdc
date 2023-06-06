// to be signed by Client
import FilePrivilegesContract from 0x02

transaction {
  prepare(acct: AuthAccount) {
    // cannot create resource type outside of containing contract: `FilePrivilegesContract.FileAdminIndicator`
    // acct.save(<- create FilePrivilegesContract.FileAdminIndicator(), to: /storage/fileAdminIndicator)
    // acct.save(<- FilePrivilegesContract.createEmptyCollection(), to: /storage/fileAdminIndicator)

    
  }
}

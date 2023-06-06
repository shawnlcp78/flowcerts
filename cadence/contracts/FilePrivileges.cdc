// Team FlowCerts

// Idea: tokens are used for capability-based access control

pub contract FilePrivilegesContract {
  // FileAdminIndicator - main purpose is to help FileContract functions verify that this is the admin without exposing AuthAccount
  // therefore, it is only issued to its own account (the admin account)
  pub resource FileAdminIndicator {
    priv let isAdmin: Bool

    init() {
      self.isAdmin = true
    }

    pub fun getIsAdmin(): Bool {
      return self.isAdmin
    }
  }

  // AccountToken, very simple
  pub resource AccountToken {
    priv let address: String

    init(address: String) {
      self.address = address
    }

    pub fun getAddress(): String {
      return self.address;
    }
  }

  pub resource interface AccountTokenCollectionPublic {
    // Admin-only methods
    pub fun setAccountToken(adminCapability: &FileAdminIndicator,  accountToken: @AccountToken)
  }

  // AccountTokenCollection to hold the AccountToken
  pub resource AccountTokenCollection: AccountTokenCollectionPublic {
    priv let maxTokens: Int
    priv var accountToken: @[AccountToken]

    init() {
      self.maxTokens = 1
      self.accountToken <- []
    }

    // ONLY ADMIN CAN SET ACCOUNT TOKEN
    pub fun setAccountToken(adminCapability: &FileAdminIndicator,  accountToken: @AccountToken) {
      if (adminCapability.getIsAdmin() != true) { panic("Unauthorised") }
      if (self.accountToken.length == self.maxTokens) { panic("Unauthorised") }
      self.accountToken.append(<- accountToken)
    }

    pub fun getAccountAddress(): String {
      return self.accountToken[0].getAddress()
    }

    destroy() {
      destroy self.accountToken
    }
  }

  pub fun createEmptyCollection(): @AccountTokenCollection {
    return <- create AccountTokenCollection()
  }

  // ONLY ADMIN CAN ISSUE ACCOUNT TOKENS
  pub fun mintAccountToken(adminCapability: &FileAdminIndicator, address: String): @AccountToken {
    if (adminCapability.getIsAdmin() != true) { panic("Unauthorised") }
    var newToken <- create AccountToken(address: address)
    return <- newToken
  }

  init() {
    // Declare this account as admin
    self.account.save(<- create FileAdminIndicator(), to: /storage/fileAdminIndicator)

    // DO NOT EXPOSE ADMIN INDICATOR ON PUBLIC AS PEOPLE CAN JUST BORROW IT AND ACT AS ADMIN
    // self.account.link<&FileAdminIndicator>(/public/fileAdminIndicator, target: /storage/fileAdminIndicator)
  }
}


// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {CredentialRegistry} from "./CredentialRegistry.sol";

/// @title DemoCreditPool
/// @notice Pre-funded pool that releases settlement tokens against a valid
///         income credential.
/// @dev No repayment, no interest, no collections. It exists so an approved
///      decision moves real value on-chain. Disclosed as simulated capital.
contract DemoCreditPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Share of one pay cycle that may be advanced, in basis points.
    uint256 public constant MAX_ADVANCE_BPS = 3000;
    uint256 public constant BAND_COUNT = 10;
    uint8 public constant TOKEN_DECIMALS = 6;

    IERC20 public immutable token;
    CredentialRegistry public immutable credentials;

    mapping(bytes32 credentialId => uint256 drawn) public drawnAgainst;

    /// @dev Credentials never expire, so freshness is the consumer's policy and
    ///      this pool is a consumer. Evidence older than this source height is
    ///      not lent against. Monotonic, so raising it cannot be undone.
    uint64 public minimumEvidenceHeight;

    event Disbursed(
        bytes32 indexed credentialId, address indexed subject, uint256 amount, uint256 remaining
    );
    event Funded(address indexed from, uint256 amount);
    event MinimumEvidenceHeightSet(uint64 height);
    event Withdrawn(address indexed to, uint256 amount);

    error ZeroAddress();
    error UnsupportedDecimals(uint8 given);
    error ZeroAmount();
    error CredentialNotValid(bytes32 credentialId);
    error UnknownBand(uint8 band);
    error ExceedsLimit(uint256 requested, uint256 remaining);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error EvidenceTooOld(uint64 given, uint64 minimum);
    error MinimumEvidenceHeightCannotDecrease(uint64 given, uint64 current);
    error IncorrectAmountReceived(address recipient, uint256 expected, uint256 received);

    constructor(IERC20 _token, CredentialRegistry _credentials, address initialOwner)
        Ownable(initialOwner)
    {
        if (address(_token) == address(0)) revert ZeroAddress();
        if (address(_credentials) == address(0)) revert ZeroAddress();

        // Limits are computed in six-decimal base units.
        uint8 tokenDecimals = IERC20Metadata(address(_token)).decimals();
        if (tokenDecimals != TOKEN_DECIMALS) revert UnsupportedDecimals(tokenDecimals);

        token = _token;
        credentials = _credentials;
    }

    /// @notice Releases an advance to the credential's subject.
    /// @dev Permissionless so a relayer can pay gas, but funds always go to the
    ///      subject recorded in the credential, never to the caller.
    function disburse(bytes32 credentialId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        if (credentials.statusOf(credentialId) != CredentialRegistry.Status.Valid) {
            revert CredentialNotValid(credentialId);
        }

        CredentialRegistry.Credential memory c = credentials.credentialOf(credentialId);

        if (c.evidenceEndHeight < minimumEvidenceHeight) {
            revert EvidenceTooOld(c.evidenceEndHeight, minimumEvidenceHeight);
        }

        uint256 remaining = _limitFor(c.band) - drawnAgainst[credentialId];
        if (amount > remaining) revert ExceedsLimit(amount, remaining);

        uint256 available = token.balanceOf(address(this));
        if (amount > available) revert InsufficientLiquidity(amount, available);

        drawnAgainst[credentialId] += amount;

        // The limit is charged in full, so the subject must receive in full.
        uint256 before = token.balanceOf(c.subject);
        token.safeTransfer(c.subject, amount);
        uint256 received = token.balanceOf(c.subject) - before;
        if (received != amount) revert IncorrectAmountReceived(c.subject, amount, received);

        emit Disbursed(credentialId, c.subject, amount, remaining - amount);
    }

    /// @notice Adds liquidity from the caller.
    function fund(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received != amount) revert IncorrectAmountReceived(address(this), amount, received);

        emit Funded(msg.sender, amount);
    }

    /// @notice Removes liquidity. Owner only.
    function withdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    /// @notice Raises the freshness floor. Owner only, monotonic.
    function setMinimumEvidenceHeight(uint64 height) external onlyOwner {
        if (height < minimumEvidenceHeight) {
            revert MinimumEvidenceHeightCannotDecrease(height, minimumEvidenceHeight);
        }
        minimumEvidenceHeight = height;
        emit MinimumEvidenceHeightSet(height);
    }

    /// @notice What remains drawable against a credential. Zero if it is not
    ///         valid or its evidence is below the freshness floor.
    function remainingFor(bytes32 credentialId) external view returns (uint256) {
        if (credentials.statusOf(credentialId) != CredentialRegistry.Status.Valid) return 0;
        CredentialRegistry.Credential memory c = credentials.credentialOf(credentialId);
        if (c.evidenceEndHeight < minimumEvidenceHeight) return 0;
        return _limitFor(c.band) - drawnAgainst[credentialId];
    }

    /// @notice Total advance a band permits.
    function limitForBand(uint8 band) external pure returns (uint256) {
        return _limitFor(band);
    }

    /// @dev Derived from the band FLOOR, never an exact amount. The floor is
    ///      already public, so taking the maximum advance reveals nothing the
    ///      band did not. Deriving it from the real amount would let the figure
    ///      be divided back out.
    function _limitFor(uint8 band) internal pure returns (uint256) {
        if (band >= BAND_COUNT) revert UnknownBand(band);
        return (_bandFloor(band) * MAX_ADVANCE_BPS) / 10_000;
    }

    /// @dev Mirrors shared/bands.ts. Band 0 has a zero floor and so permits no
    ///      advance: $50 and $499 are indistinguishable inside it.
    function _bandFloor(uint8 band) internal pure returns (uint256) {
        uint256[10] memory floors = [
            uint256(0),
            500_000_000,
            1_000_000_000,
            1_500_000_000,
            2_500_000_000,
            4_000_000_000,
            6_000_000_000,
            10_000_000_000,
            15_000_000_000,
            25_000_000_000
        ];
        return floors[band];
    }
}

import { UserLoginDTO } from './userLoginDTO.model';
import { UserResponseDTO } from './userResponseDTO.model';

export type LoginResponseDTO = {
  token: string;
  user: UserResponseDTO;
};
